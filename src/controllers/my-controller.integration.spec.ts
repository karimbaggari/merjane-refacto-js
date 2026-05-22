import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import { type DeepMockProxy, mockDeep } from "vitest-mock-extended";
import { asValue } from "awilix";
import { type INotificationService } from "@/services/notifications.port.js";
import {
  type ProductInsert,
  products,
  orders,
  ordersToProducts,
} from "@/db/schema.js";
import { type Database } from "@/db/type.js";
import { buildFastify } from "@/fastify.js";

describe("MyController Integration Tests", () => {
  let fastify: FastifyInstance;
  let database: Database;
  let notificationServiceMock: DeepMockProxy<INotificationService>;

  beforeEach(async () => {
    notificationServiceMock = mockDeep<INotificationService>();

    fastify = await buildFastify();
    fastify.diContainer.register({
      notificationService: asValue(notificationServiceMock as INotificationService),
    });
    await fastify.ready();
    database = fastify.database;
  });
  afterEach(async () => {
    await fastify.close();
  });

  it("ProcessOrderShouldReturn", async () => {
    const client = supertest(fastify.server);
    const allProducts = createProducts();
    const orderId = database.transaction((tx) => {
      const productList = tx
        .insert(products)
        .values(allProducts)
        .returning({ productId: products.id })
        .all();
      const order = tx
        .insert(orders)
        .values([{}])
        .returning({ orderId: orders.id })
        .get();
      tx.insert(ordersToProducts)
        .values(
          productList.map((p) => ({
            orderId: order!.orderId,
            productId: p.productId,
          }))
        )
        .run();
      return order!.orderId;
    });

    await client
      .post(`/orders/${orderId}/processOrder`)
      .expect(200)
      .expect("Content-Type", /application\/json/);

    const resultOrder = await database.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    expect(resultOrder!.id).toBe(orderId);
  });

  function createProducts(): ProductInsert[] {
    const d = 24 * 60 * 60 * 1000;
    return [
      {
        leadTime: 15,
        available: 30,
        type: "NORMAL",
        name: "USB Cable",
      },
      {
        leadTime: 10,
        available: 0,
        type: "NORMAL",
        name: "USB Dongle",
      },
      {
        leadTime: 15,
        available: 30,
        type: "EXPIRABLE",
        name: "Butter",
        expiryDate: new Date(Date.now() + 26 * d),
      },
      {
        leadTime: 90,
        available: 6,
        type: "EXPIRABLE",
        name: "Milk",
        expiryDate: new Date(Date.now() - 2 * d),
      },
      {
        leadTime: 15,
        available: 30,
        type: "SEASONAL",
        name: "Watermelon",
        seasonStartDate: new Date(Date.now() - 2 * d),
        seasonEndDate: new Date(Date.now() + 58 * d),
      },
      {
        leadTime: 15,
        available: 30,
        type: "SEASONAL",
        name: "Grapes",
        seasonStartDate: new Date(Date.now() + 180 * d),
        seasonEndDate: new Date(Date.now() + 240 * d),
      },
    ];
  }

  it("should decrement available for NORMAL product in stock", async () => {
    const client = supertest(fastify.server);

    const productId = database
      .insert(products)
      .values({
        leadTime: 15,
        available: 30,
        type: "NORMAL",
        name: "USB Cable",
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    const result = await database.query.products.findFirst({
      where: eq(products.id, productId),
    });
    expect(result!.available).toBe(29);
  });

  it("should send delay notification for NORMAL product out of stock with leadTime", async () => {
    const client = supertest(fastify.server);

    const productId = database
      .insert(products)
      .values({
        leadTime: 10,
        available: 0,
        type: "NORMAL",
        name: "USB Dongle",
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      10,
      "USB Dongle"
    );
  });

  it("should do nothing for NORMAL product out of stock with zero leadTime", async () => {
    const client = supertest(fastify.server);

    const productId = database
      .insert(products)
      .values({
        leadTime: 0,
        available: 0,
        type: "NORMAL",
        name: "Dead Item",
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(
      notificationServiceMock.sendDelayNotification
    ).not.toHaveBeenCalled();
    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).not.toHaveBeenCalled();
    expect(
      notificationServiceMock.sendExpirationNotification
    ).not.toHaveBeenCalled();
  });

  it("should decrement available for SEASONAL product in season and in stock", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;

    const productId = database
      .insert(products)
      .values({
        leadTime: 15,
        available: 30,
        type: "SEASONAL",
        name: "Watermelon",
        seasonStartDate: new Date(Date.now() - 10 * d), // ? il y a 10 jours
        seasonEndDate: new Date(Date.now() + 50 * d), // ? dans 50 jours
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    const result = await database.query.products.findFirst({
      where: eq(products.id, productId),
    });
    expect(result!.available).toBe(29);
  });

  it("should send out of stock notification when SEASONAL leadTime pushes past season end", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;

    const productId = database
      .insert(products)
      .values({
        leadTime: 90,
        available: 0,
        type: "SEASONAL",
        name: "Watermelon",
        seasonStartDate: new Date(Date.now() - 2 * d), // ? il y a 2 jours
        seasonEndDate: new Date(Date.now() + 10 * d), // ? dans 10 jours
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Watermelon");
    const result = await database.query.products.findFirst({
      where: eq(products.id, productId),
    });
    expect(result!.available).toBe(0);
  });

  it("should send out of stock notification when SEASONAL season has not started", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;

    const productId = database
      .insert(products)
      .values({
        leadTime: 15,
        available: 30,
        type: "SEASONAL",
        name: "Grapes",
        seasonStartDate: new Date(Date.now() + 30 * d), // ? dans 30 jours
        seasonEndDate: new Date(Date.now() + 90 * d), // ? dans 90 jours
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith("Grapes");
  });

  it("should send delay notification for SEASONAL in season with leadTime fitting", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;

    const productId = database
      .insert(products)
      .values({
        leadTime: 5,
        available: 0,
        type: "SEASONAL",
        name: "Watermelon",
        seasonStartDate: new Date(Date.now() - 10 * d), // ? il y a 10 jours
        seasonEndDate: new Date(Date.now() + 50 * d), // ? dans 50 jours
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      5,
      "Watermelon"
    );
  });

  it("should decrement available for EXPIRABLE product in stock and not expired", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;

    const productId = database
      .insert(products)
      .values({
        leadTime: 15,
        available: 30,
        type: "EXPIRABLE",
        name: "Butter",
        expiryDate: new Date(Date.now() + 26 * d), // ? expire dans 26 jours
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    const result = await database.query.products.findFirst({
      where: eq(products.id, productId),
    });
    expect(result!.available).toBe(29);
  });

  it("should send expiration notification and set available to 0 for expired product", async () => {
    const client = supertest(fastify.server);
    const d = 24 * 60 * 60 * 1000;
    const expiryDate = new Date(Date.now() - 2 * d); // ? expiré il y a 2 jours

    const productId = database
      .insert(products)
      .values({
        leadTime: 90,
        available: 6,
        type: "EXPIRABLE",
        name: "Milk",
        expiryDate,
      })
      .returning({ id: products.id })
      .get().id;

    const orderId = database
      .insert(orders)
      .values({})
      .returning({ orderId: orders.id })
      .get().orderId;
    database.insert(ordersToProducts).values({ orderId, productId }).run();

    await client.post(`/orders/${orderId}/processOrder`).expect(200);

    expect(
      notificationServiceMock.sendExpirationNotification
    ).toHaveBeenCalledWith("Milk", expiryDate);
    const result = await database.query.products.findFirst({
      where: eq(products.id, productId),
    });
    expect(result!.available).toBe(0);
  });
});
