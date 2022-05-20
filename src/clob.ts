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
    return _order;
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
    throw new NotYetImplementedError();
  }

  executeOrder(order: Order) {
    // Buy Order
    // Execute the order based on lowest price
    if (order.side === SIDE_BUY) {
      for(const key in this._sellOrders) {

      }
    }

    // Sell Order
    // Execute the order based on highest price
  }

  getLowestSellOrder(): Order | undefined {
    let lowestOrderId: string | null = null;
    let currentLowestPrice: number | null = null;

    for (const key in this._sellOrders) {
      if (currentLowestPrice) {
        if(this._sellOrders[key].price < currentLowestPrice) {
          currentLowestPrice = this._sellOrders[key].price;
          lowestOrderId = this._sellOrders[key].id;
        }
      } 
    }

    if (lowestOrderId) return this._sellOrders[lowestOrderId];
  }
}
