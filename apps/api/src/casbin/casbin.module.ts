import { Global, Module } from "@nestjs/common";
import { CasbinService } from "./casbin.service.js";
import { PoliciesGuard } from "./guards/policies.guard.js";

@Global()
@Module({
  providers: [CasbinService, PoliciesGuard],
  exports: [CasbinService, PoliciesGuard],
})
export class CasbinModule {}
