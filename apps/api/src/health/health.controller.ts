import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({ summary: "Health check" })
  @ApiOkResponse({
    schema: {
      properties: {
        data: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
          },
        },
      },
    },
  })
  check() {
    return { status: "ok" };
  }

  @Get("admin/test")
  @ApiOperation({ summary: "Smoke test" })
  smokeTest() {
    return { status: "ok", smoke: true };
  }
}
