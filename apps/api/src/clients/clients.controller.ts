import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import { ClientsService } from "./clients.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

@ApiTags("clients")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission("clients", "*")
  @ApiOperation({ summary: "Create client" })
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("clients", "read")
  @ApiOperation({ summary: "List clients" })
  async findAll() {
    return this.clientsService.findAll();
  }

  @Get(":id")
  @RequirePermission("clients", "read")
  @ApiOperation({ summary: "Get client" })
  async findOne(@Param("id") id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("clients", "*")
  @ApiOperation({ summary: "Update client" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.update(id, dto, user.id);
  }

  @Post(":id/deactivate")
  @RequirePermission("clients", "*")
  @ApiOperation({ summary: "Soft-deactivate client" })
  async deactivate(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.deactivate(id, user.id);
  }

  @Delete(":id")
  @RequirePermission("clients", "*")
  @ApiOperation({ summary: "Delete client (blocked if projects exist)" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientsService.remove(id, user.id);
  }
}
