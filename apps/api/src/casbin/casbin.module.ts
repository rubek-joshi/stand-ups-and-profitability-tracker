import { Global, Module } from "@nestjs/common";
import { CasbinService } from "./casbin.service";
import { PoliciesGuard } from "./guards/policies.guard";

@Global()
@Module({
  providers: [CasbinService, PoliciesGuard],
  exports: [CasbinService, PoliciesGuard],
})
export class CasbinModule {}
