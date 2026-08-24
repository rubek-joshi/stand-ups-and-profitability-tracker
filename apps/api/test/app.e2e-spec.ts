import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureHttp } from "../src/configure-http";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
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
