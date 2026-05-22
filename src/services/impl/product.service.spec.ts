import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import { type INotificationService } from "../notifications.port.js";
import {
  createDatabaseMock,
  cleanUp,
} from "../../utils/test-utils/database-tools.ts.js";
import { ProductService } from "./product.service.js";
import { products, type Product } from "@/db/schema.js";
import { type Database } from "@/db/type.js";
import { eq } from "drizzle-orm";
describe("ProductService Tests", () => {
  let notificationServiceMock: DeepMockProxy<INotificationService>;
  let productService: ProductService;
  let databaseMock: Database;
  let databaseName: string;
  let closeDatabase: () => void;

  beforeEach(async () => {
    ({
      databaseMock,
      databaseName,
      close: closeDatabase,
    } = await createDatabaseMock());
    notificationServiceMock = mockDeep<INotificationService>();
    productService = new ProductService({
      ns: notificationServiceMock,
      db: databaseMock,
    });
  });

  afterEach(async () => {
    closeDatabase();
    await cleanUp(databaseName);
  });

  it("should handle delay notification correctly", async () => {
    // GIVEN
    const product: Product = {
      id: 1,
      leadTime: 15,
      available: 0,
      type: "NORMAL",
      name: "RJ45 Cable",
      expiryDate: null,
      seasonStartDate: null,
      seasonEndDate: null,
    };
    await databaseMock.insert(products).values(product);

    // WHEN
    await productService.notifyDelay(product.leadTime, product);

    // THEN
    expect(product.available).toBe(0);
    expect(product.leadTime).toBe(15);
    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      product.leadTime,
      product.name
    );
    const result = await databaseMock.query.products.findFirst({
      where: (product, { eq }) => eq(product.id, product.id),
    });
    expect(result).toEqual(product);
  });

  it("should send out of stock notification when lead time pushes past season end", async () => {
    // GIVEN
    const product: Product = {
      id: 1,
      leadTime: 15,
      available: 0,
      type: "SEASONAL",
      name: "Watermelon",
      expiryDate: null,
      seasonStartDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // ? il y a 2 jours
      seasonEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // ?  dans 10 jours
    };
    await databaseMock.insert(products).values(product);

    await productService.handleSeasonalProduct(product);

    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith(product.name);
    const result = await databaseMock.query.products.findFirst({
      where: eq(products.id, 1),
    });
    expect(result!.available).toBe(0);
  });

  it("should send out of stock notification when season has not started yet", async () => {
    const product: Product = {
      id: 1,
      leadTime: 15,
      available: 30,
      type: "SEASONAL",
      name: "Grapes",
      expiryDate: null,
      seasonStartDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // ? dans 30 jours
      seasonEndDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // ? dans 90 jours
    };
    await databaseMock.insert(products).values(product);

    await productService.handleSeasonalProduct(product);

    expect(
      notificationServiceMock.sendOutOfStockNotification
    ).toHaveBeenCalledWith(product.name);
  });

  it("should send delay notification when in season and lead time fits within season", async () => {
    const product: Product = {
      id: 1,
      leadTime: 5,
      available: 0,
      type: "SEASONAL",
      name: "Watermelon",
      expiryDate: null,
      seasonStartDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // ? il y a 10 jours
      seasonEndDate: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000), // ? dans 50 jours
    };
    await databaseMock.insert(products).values(product);

    await productService.handleSeasonalProduct(product);

    expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(
      product.leadTime,
      product.name
    );
  });

  it("should decrement available when product is not expired and in stock", async () => {
    const product: Product = {
      id: 1,
      leadTime: 15,
      available: 10,
      type: "EXPIRABLE",
      name: "Butter",
      expiryDate: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000), // ? expire dans 26 jours
      seasonStartDate: null,
      seasonEndDate: null,
    };
    await databaseMock.insert(products).values(product);

    await productService.handleExpiredProduct(product);

    const result = await databaseMock.query.products.findFirst({
      where: eq(products.id, 1),
    });
    expect(result!.available).toBe(9);
  });

  it("should send expiration notification and set available to 0 when product is expired", async () => {
    const expiryDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // ? expiré il y a 2 jours
    const product: Product = {
      id: 1,
      leadTime: 15,
      available: 6,
      type: "EXPIRABLE",
      name: "Milk",
      expiryDate,
      seasonStartDate: null,
      seasonEndDate: null,
    };
    await databaseMock.insert(products).values(product);

    await productService.handleExpiredProduct(product);

    expect(
      notificationServiceMock.sendExpirationNotification
    ).toHaveBeenCalledWith(product.name, expiryDate);
    const result = await databaseMock.query.products.findFirst({
      where: eq(products.id, 1),
    });
    expect(result!.available).toBe(0);
  });
});
