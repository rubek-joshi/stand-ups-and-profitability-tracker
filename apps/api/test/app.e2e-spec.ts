import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { createRfc9457ValidationPipeExceptionFactory } from "@camcima/nestjs-rfc9457";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: createRfc9457ValidationPipeExceptionFactory(),
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("/health (GET)", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200);
  });
});
