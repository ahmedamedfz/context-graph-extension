package com.demo.inventory.dto;
import java.util.UUID;
public class InventoryResponse {
    private UUID productId;
    private String productName;
    private Integer availableQuantity;
    private boolean inStock;
    public UUID getProductId() { return productId; }
    public void setProductId(UUID id) { this.productId = id; }
    public Integer getAvailableQuantity() { return availableQuantity; }
    public void setAvailableQuantity(Integer q) { this.availableQuantity = q; }
    public boolean isInStock() { return inStock; }
    public void setInStock(boolean s) { this.inStock = s; }
}
