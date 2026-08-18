import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AttendanceStatus } from "@workspace/database";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateStandupDto {
  @ApiProperty({ example: "2026-08-13" })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      "Ignored. Stand-ups always include all active employees; use profile group preference for UI filtering.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeGroupId?: string;
}

export class AllocationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  percentage!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isNonBillable?: boolean;
}

export class UpdateStandupEntryDto {
  @ApiPropertyOptional({ enum: AttendanceStatus })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  attendanceStatus?: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notesMarkdown?: string;

  @ApiPropertyOptional({ type: [AllocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

export class BatchUpdateStandupEntryItemDto extends UpdateStandupEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export const MISSING_ASSIGNMENT_ACTIONS = [
  "backward_extend",
  "split",
  "create",
  "remove_allocation",
] as const;

export type MissingAssignmentAction =
  typeof MISSING_ASSIGNMENT_ACTIONS[number];

export class AssignmentResolutionItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ enum: MISSING_ASSIGNMENT_ACTIONS })
  @IsIn(MISSING_ASSIGNMENT_ACTIONS)
  action!: MissingAssignmentAction;
}

export class BatchUpdateStandupEntriesDto {
  @ApiProperty({ type: [BatchUpdateStandupEntryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateStandupEntryItemDto)
  entries!: BatchUpdateStandupEntryItemDto[];

  @ApiPropertyOptional({
    type: [AssignmentResolutionItemDto],
    description:
      "How to resolve missing project assignments before saving stand-up entries.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentResolutionItemDto)
  assignmentResolutions?: AssignmentResolutionItemDto[];
}

export class StandupCalendarQueryDto {
  @ApiProperty({ example: "2026-08-01" })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: "2026-08-31" })
  @IsDateString()
  to!: string;
}

export class StandupHistoryQueryDto {
  @ApiPropertyOptional({
    description: "Full-text search across employee name, project name, and notes",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Limit history to this employee's entries",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeId?: string;

  @ApiPropertyOptional({
    description: "Opaque cursor from a previous history response",
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
