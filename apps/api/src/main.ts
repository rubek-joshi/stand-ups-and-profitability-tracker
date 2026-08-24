import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { applyProblemDetailResponses } from "@camcima/nestjs-rfc9457/swagger";
import { AppModule } from "./app.module";
import { configureHttp } from "./configure-http";
import { enableBigIntJson } from "./_shared/utils/bigint-json";

enableBigIntJson();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const corsOrigin = configService.get<string>(
    "CORS_ORIGIN",
    "http://localhost:4100",
  );
  app.enableCors({ origin: corsOrigin, credentials: true });
  configureHttp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Tracker API")
    .setDescription("Internal tracker API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    "docs",
    app,
    () => {
      applyProblemDetailResponses(app, {
        statuses: [400, 401, 403, 404, 422, 500],
        validationStatuses: [400, 422],
      });
      return SwaggerModule.createDocument(app, swaggerConfig);
    },
    { useGlobalPrefix: true },
  );

  const port = Number(configService.get<string>("API_PORT") ?? 4101);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
