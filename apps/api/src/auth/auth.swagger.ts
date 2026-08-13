import { applyDecorators } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { LoginResponseDto } from "./dto/login-response.dto";
import { UserResponseDto } from "../users/dto/user-response.dto";

export function AuthControllerDocs() {
  return applyDecorators(ApiTags("auth"));
}

export function LoginDocs() {
  return applyDecorators(
    ApiOperation({ summary: "Login with email and password" }),
    ApiOkResponse({ type: LoginResponseDto }),
  );
}

export function MeDocs() {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({ summary: "Get the current authenticated user" }),
    ApiOkResponse({ type: UserResponseDto }),
  );
}
