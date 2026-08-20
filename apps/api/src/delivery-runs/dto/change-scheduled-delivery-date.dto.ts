import { IsDateString, ValidateIf } from 'class-validator';

export class ChangeScheduledDeliveryDateDto {
  // The new scheduled (replanning) delivery date. requestedDeliveryDate is
  // never touched by this action.
  @IsDateString()
  scheduledDeliveryDate: string;

  // CAS target — the order's last-known scheduledDeliveryDate. Order has no
  // version column; this mirrors assignOrderToRun's source-CAS philosophy
  // (CAS on the real invariant, not a bolted-on counter). Always required
  // (never omitted), but null is a valid value — the order may never have
  // had a scheduled date (the undated-deliveries case).
  @ValidateIf((o: ChangeScheduledDeliveryDateDto) => o.expectedScheduledDeliveryDate !== null)
  @IsDateString()
  expectedScheduledDeliveryDate: string | null;
}
