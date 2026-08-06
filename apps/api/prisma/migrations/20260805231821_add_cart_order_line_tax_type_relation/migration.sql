-- AddForeignKey
ALTER TABLE "cart_order_lines" ADD CONSTRAINT "cart_order_lines_taxTypeId_fkey" FOREIGN KEY ("taxTypeId") REFERENCES "tax_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
