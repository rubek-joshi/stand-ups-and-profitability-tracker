import { ApiProperty } from "@nestjs/swagger";
import { UserResponseDto } from "../../users/dto/user-response.dto";

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
