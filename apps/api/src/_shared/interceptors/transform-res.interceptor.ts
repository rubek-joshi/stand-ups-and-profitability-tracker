import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

type WrappedResponse = {
  data: unknown;
  meta?: unknown;
};

@Injectable()
export class TransformResInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<WrappedResponse | StreamableFile> {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload instanceof StreamableFile) {
          return payload;
        }
        if (
          payload !== null &&
          typeof payload === "object" &&
          "data" in (payload as Record<string, unknown>)
        ) {
          const body = payload as WrappedResponse;
          if (body.meta !== undefined) {
            return { data: body.data, meta: body.meta };
          }
          return { data: body.data };
        }
        return { data: payload };
      }),
    );
  }
}
