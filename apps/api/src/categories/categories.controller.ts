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
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@ApiTags("categories")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermission("categories", "*")
  @ApiOperation({ summary: "Create category" })
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("categories", "read")
  @ApiOperation({ summary: "List categories" })
  async findAll() {
    return this.categoriesService.findAll();
  }

  @Get(":id")
  @RequirePermission("categories", "read")
  @ApiOperation({ summary: "Get category" })
  async findOne(@Param("id") id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(":id")
  @RequirePermission("categories", "*")
  @ApiOperation({ summary: "Update category" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.update(id, dto, user.id);
  }

  @Post(":id/deactivate")
  @RequirePermission("categories", "*")
  @ApiOperation({ summary: "Deactivate category" })
  async deactivate(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.categoriesService.deactivate(id, user.id);
  }

  @Delete(":id")
  @RequirePermission("categories", "*")
  @ApiOperation({ summary: "Delete category (blocked if projects exist)" })
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.categoriesService.remove(id, user.id);
  }
}
