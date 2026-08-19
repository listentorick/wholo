import {
  IsArray, ArrayMinSize, IsString, IsNotEmpty,
} from 'class-validator';

export class ReorderRouteCustomersDto {
  // Full ordered list of the route's active customerIds, front to back —
  // must contain exactly the route's current active customers, no more, no
  // fewer (a partial reorder is rejected rather than guessed at).
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderedCustomerIds: string[];
}
