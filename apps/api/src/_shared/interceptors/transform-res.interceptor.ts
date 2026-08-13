import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
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
  ): Observable<WrappedResponse> {
    return next.handle().pipe(
      map((payload: unknown) => {
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
