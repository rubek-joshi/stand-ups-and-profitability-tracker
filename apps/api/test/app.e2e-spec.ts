import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureHttp } from "../src/configure-http.js";

describe("AppController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    configureHttp(app);
    await app.init();
  });

  afterAll(async () => {
    if (!app) return;
    await app.close();
    // Allow BullMQ/ioredis sockets to finish closing without unhandled rejections.
    await new Promise((resolve) => setTimeout(resolve, 250));
  });

  it("/health (GET)", () => {
    return request(app.getHttpServer()).get("/health").expect(200);
  });

  it("serves auth at /auth/login", async () => {
    const res = await request(app.getHttpServer()).post("/auth/login");
    expect(res.status).not.toBe(404);
  });

  it("does not serve auth at /api/auth/login (prefix is stripped by Vite/Nginx)", () => {
    return request(app.getHttpServer()).post("/api/auth/login").expect(404);
  });
});
