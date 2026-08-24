import { INestApplication, ValidationPipe } from "@nestjs/common";
import { createRfc9457ValidationPipeExceptionFactory } from "@camcima/nestjs-rfc9457";
import { TransformResInterceptor } from "./_shared/interceptors/transform-res.interceptor";

export function configureHttp(app: INestApplication): void {
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
