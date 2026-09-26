package com.demo.inventory.dto;
public class InventoryUpdateRequest {
    private Integer quantity;
    private String warehouseLocation;
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer q) { this.quantity = q; }
}
