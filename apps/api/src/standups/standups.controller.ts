import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../_shared/decorators/current-user.decorator";
import { AuthUser } from "../auth/types/auth-user.type";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RequirePermission } from "../casbin/decorators/require-permission.decorator";
import { PoliciesGuard } from "../casbin/guards/policies.guard";
import {
  CreateStandupDto,
  BatchUpdateStandupEntriesDto,
  StandupCalendarQueryDto,
  StandupHistoryQueryDto,
  UpdateStandupEntryDto,
} from "./dto/standup.dto";
import { StandupsService } from "./standups.service";

@ApiTags("standups")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PoliciesGuard)
@Controller("standups")
export class StandupsController {
  constructor(private readonly standupsService: StandupsService) {}

  @Post()
  @RequirePermission("standups", "*")
  @ApiOperation({ summary: "Create standup with active employees" })
  async create(
    @Body() dto: CreateStandupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.standupsService.create(dto, user.id);
  }

  @Get()
  @RequirePermission("standups", "read")
  @ApiOperation({ summary: "List standups" })
  async findAll(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.standupsService.findAll({ page, pageSize });
  }

  @Get("calendar")
  @RequirePermission("standups", "read")
  @ApiOperation({ summary: "Stand-up dates in a range for calendar view" })
  async findCalendar(@Query() query: StandupCalendarQueryDto) {
    return this.standupsService.findCalendar(query.from, query.to);
  }

  @Get("history")
  @RequirePermission("standups", "read")
  @ApiOperation({
    summary: "Stand-up history with cursor pagination and full-text search",
  })
  async findHistory(@Query() query: StandupHistoryQueryDto) {
    return this.standupsService.findHistory(query);
  }

  @Get(":id")
  @RequirePermission("standups", "read")
  @ApiOperation({ summary: "Get standup with entries and allocations" })
  async findOne(@Param("id") id: string) {
    return this.standupsService.findOne(id);
  }

  @Patch(":id/entries")
  @RequirePermission("standups", "*")
  @ApiOperation({ summary: "Batch update standup entries" })
  async updateEntries(
    @Param("id") id: string,
    @Body() dto: BatchUpdateStandupEntriesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.standupsService.updateEntries(id, dto, user.id);
  }

  @Patch(":id/entries/:entryId")
  @RequirePermission("standups", "*")
  @ApiOperation({ summary: "Update standup entry" })
  async updateEntry(
    @Param("id") id: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateStandupEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.standupsService.updateEntry(id, entryId, dto, user.id);
  }

  @Post(":id/complete")
  @RequirePermission("standups", "*")
  @ApiOperation({ summary: "Complete standup and derive attendance" })
  async complete(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.standupsService.complete(id, user.id);
  }

  @Post(":id/reopen")
  @RequirePermission("standups", "*")
  @ApiOperation({ summary: "Reopen completed standup (admin)" })
  async reopen(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.standupsService.reopen(id, user.id);
  }
}
