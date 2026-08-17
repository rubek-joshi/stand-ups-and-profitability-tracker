import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AttendanceStatus } from "@workspace/database";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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
    description: "Limit participants to this employee group; omit for everyone",
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

export class BatchUpdateStandupEntriesDto {
  @ApiProperty({ type: [BatchUpdateStandupEntryItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateStandupEntryItemDto)
  entries!: BatchUpdateStandupEntryItemDto[];
}

export class StandupCalendarQueryDto {
  @ApiProperty({ example: "2026-08-01" })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: "2026-08-31" })
  @IsDateString()
  to!: string;
}
