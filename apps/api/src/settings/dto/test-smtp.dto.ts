import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class TestSmtpDto {
  @ApiProperty({ example: "you@example.com" })
  @IsEmail()
  to!: string;
}
