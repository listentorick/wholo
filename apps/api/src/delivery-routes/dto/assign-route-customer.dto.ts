import { IsString, IsNotEmpty } from 'class-validator';

export class AssignRouteCustomerDto {
  @IsString()
  @IsNotEmpty()
  customerId: string;
}
