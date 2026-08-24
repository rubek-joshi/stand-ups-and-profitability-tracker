import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from "@nestjs/common";
import { createRfc9457ValidationPipeExceptionFactory } from "@camcima/nestjs-rfc9457";
import { TransformResInterceptor } from "./_shared/interceptors/transform-res.interceptor";

/** REST routes live under /api so they do not collide with SPA paths like /clients. */
export const API_GLOBAL_PREFIX = "api";

export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/admin/test", method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: createRfc9457ValidationPipeExceptionFactory(),
    }),
  );
  app.useGlobalInterceptors(new TransformResInterceptor());
}
