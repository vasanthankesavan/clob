/** This module implements a price-time matching engine for a centralize limit
 * order book (CLOB).
 */

import { Order } from "./types/order";
import { OrderInput } from "./types/order-input";
import { Logger } from "./util/logger";
import { idFactory } from "./util/id-factory";
import { AggregatedBook } from "./types/aggregated-book";
import { timestampFactory } from "./util/timestamp-factory";
import { Trade } from "./types/trade";
import { NotYetImplementedError } from "./util/not-yet-implemented-error";
import { SIDE_BUY, SIDE_SELL } from "./types/side";
import { PriceLevel } from "./types/price-level-schema";

/** Single-ticket CLOB order book and trade execution engine */
export class Clob {
  private readonly logger = new Logger(Clob.name);
  private _buyOrders: Record<string, Order> = {};
  private _sellOrders: Record<string, Order> = {};
  private _trades: Record<string, Trade> = {};
  private _buyOrderCount = 0;
  private _sellOrderCount = 0;
  private _bookSweepCount = 0;

  public constructor() {
    this.logger.debug("Instantiating");
  }

  /** Aggregate open orders into publicly-available price levels */
  getAggregatedBook(): AggregatedBook {
    this.logger.debug("Getting aggregated book");
    const asks: PriceLevel[] = [];
    const bids: PriceLevel[] = [];

    const askLevels: Record<number, number> = {};
    const bidLevels: Record<number, number> = {};

    for (const key in this._buyOrders) {
      const price = this._buyOrders[key].price;
      const quantity = this._buyOrders[key].quantity;

      if (price in bidLevels) {
        bidLevels[price] = bidLevels[price] + quantity;
      } else {
        bidLevels[price] = quantity;
      }
    }

    for (const key in bidLevels) {
      const priceLevel: PriceLevel = { price: Number(key), quantity: bidLevels[key] };
      bids.push(priceLevel);
    }

    for (const key in this._sellOrders) {
      const price = this._sellOrders[key].price;
      const quantity = this._sellOrders[key].quantity;

      if (price in askLevels) {
        askLevels[price] = askLevels[price] + quantity;
      } else {
        askLevels[price] = quantity;
      }
    }

    for (const key in askLevels) {
      const priceLevel: PriceLevel = { price: Number(key), quantity: askLevels[key] };
      asks.push(priceLevel);
    }

    return { asks, bids };
  }



  /** Handle an order request placed by a trader
   * @param input Order event
   * @returns The newly-created ClobOrder
   */
  createOneOrder(input: OrderInput): Order {
    const id = idFactory();
    this.logger.debug(
      `Matching order for trader=${input.trader} with id=${id}`,
    );
    let _order: Order;

    if (input.side === SIDE_BUY) {
      this._buyOrderCount = this._buyOrderCount + 1;
      _order = {
        createdAt: timestampFactory(),
        id,
        price: input.price,
        quantity: input.quantity,
        quantityRemaining: input.quantity,
        side: input.side,
        trader: input.trader,
        tradeIds: [],
        orderCount: this._buyOrderCount
      };
      this._buyOrders[id] = _order;
    } else {
      this._sellOrderCount = this._sellOrderCount + 1;
      _order = {
        createdAt: timestampFactory(),
        id,
        price: input.price,
        quantity: input.quantity,
        quantityRemaining: input.quantity,
        side: input.side,
        trader: input.trader,
        tradeIds: [],
        orderCount: this._sellOrderCount
      };
      this._sellOrders[id] = _order;
    }
    
    this.executeOrder(_order);
    if (_order.side === SIDE_SELL && (
      (this._buyOrderCount > this._bookSweepCount) &&
      (_order.quantityRemaining > 0)
     )) {
      let remainingCount = this._buyOrderCount - this._bookSweepCount;

      while (remainingCount !== this._buyOrderCount) {
        this.executeOrder(_order);
        remainingCount = remainingCount + 1;
      }
    }
    return this.getOneOrder(_order.id);
  }

  /** Load an order by its id */
  getOneOrder(orderId: string): Order {
    this.logger.debug(`Loading order with id=${orderId}`);
    if (orderId in this._buyOrders) {
      return this._buyOrders[orderId];
    } else {
      return this._sellOrders[orderId];
    }
  }

  /** Load a trade by its id */
  getOneTrade(tradeId: string): Trade {
    this.logger.debug(`Loading trade with id=${tradeId}`);
    return this._trades[tradeId];
  }

  checkIfTradeEligible(order: Order): boolean {
    if (order.side === SIDE_BUY) {
      const price = order.price;

      for (const key in this._sellOrders) {
        if (this._sellOrders[key].price <= price) {
          return true
        }
      }

      return false;
    } else {
      const price = order.price;

      for (const key in this._buyOrders) {
        if (this._buyOrders[key].price >= price) {
          return true
        }
      }

      return false;
    }
  }

  executeOrder(order: Order): void {
    const checkIfEligible = this.checkIfTradeEligible(order);
    // Buy Order
    // Execute the order based on lowest price
    if (checkIfEligible) {
      if (order.side === SIDE_BUY) {
        const eligibleAsk = this.getLowestSellOrder();
  
        if (eligibleAsk && eligibleAsk.trader !== order.trader) {
          this._bookSweepCount = this._bookSweepCount + 1;
          const remaining = order.quantity - this._sellOrders[eligibleAsk.id].quantity;
          const executed = order.quantity - remaining;

          if (remaining > 0) {
            this._buyOrders[order.id].quantityRemaining = remaining;
            this._sellOrders[eligibleAsk.id].quantityRemaining = 0;
          } else {
            this._buyOrders[order.id].quantityRemaining = remaining;
            this._sellOrders[eligibleAsk.id].quantityRemaining = remaining;
          }
  
          const tradeId = idFactory();
          let tradePrice: number;
          if(order.price !== eligibleAsk.price) {
            tradePrice = order.price;
          } else {
            tradePrice = order.price;
          }
        
          this.generateTrade(tradeId, executed, order, eligibleAsk, tradePrice);
  
          order.tradeIds.push(tradeId);
          this._sellOrders[eligibleAsk.id].tradeIds.push(tradeId);
        }
      } else {
        const eligibleBid = this.getHighestBidOrder();
        
        if (eligibleBid && eligibleBid.trader !== order.trader) {
          this._bookSweepCount = this._bookSweepCount + 1;

          const remaining = order.quantityRemaining - this._buyOrders[eligibleBid.id].quantity;
          const executed = order.quantityRemaining - remaining;
          
          if (remaining > 0) {
            this._sellOrders[order.id].quantityRemaining = remaining;
            this._buyOrders[eligibleBid.id].quantityRemaining = 0;
          } else {
            this._sellOrders[order.id].quantityRemaining = remaining;
            this._buyOrders[eligibleBid.id].quantityRemaining = remaining;
          }
          
          const tradeId = idFactory();
          let tradePrice: number;
          if(order.price !== eligibleBid.price) {
            tradePrice = eligibleBid.price;
          } else {
            tradePrice = order.price;
          }
  
          this.generateTrade(tradeId, executed, eligibleBid, order, tradePrice);
  
          order.tradeIds.push(tradeId);
          this._buyOrders[eligibleBid.id].tradeIds.push(tradeId);
        }
      }
    }
    
  }

  getLowestSellOrder(): Order | undefined {
    let lowestOrderId: string | undefined;
    let currentLowestPrice: number | null = null;

    if (Object.keys(this._sellOrders).length > 0) {
      currentLowestPrice = this._sellOrders[Object.keys(this._sellOrders)[0]].price;
      lowestOrderId = this._sellOrders[Object.keys(this._sellOrders)[0]].id;

      for (const key in this._sellOrders) {
          if(this._sellOrders[key].price < (currentLowestPrice as number) && this._sellOrders[key].quantityRemaining !== 0) {
            currentLowestPrice = this._sellOrders[key].price;
            lowestOrderId = this._sellOrders[key].id;
          }
      }
    }

    if(lowestOrderId) return this._sellOrders[lowestOrderId];

    return undefined;
  }

  getHighestBidOrder(): Order | undefined {
    let highestBidId: string | undefined;
    let currentHighestPrice: number | undefined;
    let currentOrderCount: number | undefined;

    if (Object.keys(this._buyOrders).length > 0) {
      currentHighestPrice = this._buyOrders[Object.keys(this._buyOrders)[0]].price;
      highestBidId = this._buyOrders[Object.keys(this._buyOrders)[0]].id;
      currentOrderCount = this._buyOrders[Object.keys(this._buyOrders)[0]].orderCount;

      const allPrices = [];

      for (const key in this._buyOrders) {
        allPrices.push(this._buyOrders[key].price);
          if(this._buyOrders[key].price > (currentHighestPrice as number) && this._buyOrders[key].quantityRemaining !== 0) {
            currentHighestPrice = this._buyOrders[key].price;
            highestBidId = this._buyOrders[key].id;
          }
      }

      let priceLevelCount = allPrices.filter(x => x == currentHighestPrice).length;

      if (priceLevelCount > 1) {
        // Get the oldest one (lowest order count)
        const orders: Order[] = [];

        for (const key in this._buyOrders) {
          if (this._buyOrders[key].price === currentHighestPrice) {
            if (currentOrderCount > this._buyOrders[key].orderCount) {
              currentOrderCount = this._buyOrders[key].orderCount;
              highestBidId = this._buyOrders[key].id;
            }
          }
        }
      }
      
    }

    if(highestBidId) return this._buyOrders[highestBidId];

    return undefined;
  }

  generateTrade(uniqueId: string, quantity: number, buyOrder: Order, sellOrder: Order, tradePrice: number): Trade {
    const trade: Trade = {
      id: uniqueId,
      price: tradePrice,
      quantity,
      buyOrderId: buyOrder.id,
      sellOrderId: sellOrder.id
    }

    this._trades[uniqueId] = trade;
    return trade;
  }
}
