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
import { SIDE_BUY } from "./types/side";

/** Single-ticket CLOB order book and trade execution engine */
export class Clob {
  private readonly logger = new Logger(Clob.name);
  private _buyOrders: Record<string, Order> = {};
  private _sellOrders: Record<string, Order> = {};
  private _trades: Record<string, Trade> = {};

  public constructor() {
    this.logger.debug("Instantiating");
  }

  /** Aggregate open orders into publicly-available price levels */
  getAggregatedBook(): AggregatedBook {
    this.logger.debug("Getting aggregated book");
    throw new NotYetImplementedError();
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
    const _order: Order = {
      createdAt: timestampFactory(),
      id,
      price: input.price,
      quantity: input.quantity,
      quantityRemaining: input.quantity,
      side: input.side,
      trader: input.trader,
      tradeIds: [],
    };

    if (input.side === SIDE_BUY) {
      this._buyOrders[id] = _order;
    } else {
      this._sellOrders[id] = _order; // Makes an assumption that there is only two sides B/S
    }
    this.executeOrder(_order);
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

  executeOrder(order: Order): void {
    // Buy Order
    // Execute the order based on lowest price
    if (order.side === SIDE_BUY) {
      const eligibleAsk = this.getLowestSellOrder();

      if (eligibleAsk) {
        const remaining = order.quantity - this._sellOrders[eligibleAsk.id].quantity;
        const executed = order.quantity - remaining;
        this._buyOrders[order.id].quantityRemaining = remaining;
        this._sellOrders[eligibleAsk.id].quantityRemaining = remaining;

        const tradeId = idFactory();
        this.generateTrade(tradeId, executed, order, eligibleAsk, eligibleAsk.price);

        order.tradeIds.push(tradeId);
        this._sellOrders[eligibleAsk.id].tradeIds.push(tradeId);
      }
    } else {
      const eligibleBid = this.getHighestBidOrder();

      if (eligibleBid) {
        const remaining = order.quantity - this._buyOrders[eligibleBid.id].quantity;
        const executed = order.quantity - remaining;
        this._sellOrders[order.id].quantityRemaining = remaining;
        this._buyOrders[eligibleBid.id].quantityRemaining = remaining;

        const tradeId = idFactory();
        this.generateTrade(tradeId, executed, eligibleBid, order, eligibleBid.price);

        order.tradeIds.push(tradeId);
        this._buyOrders[eligibleBid.id].tradeIds.push(tradeId);
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

    if (Object.keys(this._buyOrders).length > 0) {
      currentHighestPrice = this._buyOrders[Object.keys(this._buyOrders)[0]].price;
      highestBidId = this._buyOrders[Object.keys(this._buyOrders)[0]].id;

      for (const key in this._buyOrders) {
          if(this._buyOrders[key].price > (currentHighestPrice as number) && this._buyOrders[key].quantityRemaining !== 0) {
            currentHighestPrice = this._buyOrders[key].price;
            highestBidId = this._buyOrders[key].id;
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
