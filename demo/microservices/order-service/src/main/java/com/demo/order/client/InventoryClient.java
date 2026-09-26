package com.demo.order.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.UUID;

@FeignClient(name = "inventory-service", url = "${inventory-service.url}")
public interface InventoryClient {

    @GetMapping("/inventory/{productId}/check")
    InventoryCheckResponse checkInventory(@PathVariable UUID productId);

    @GetMapping("/inventory/{productId}/reserve")
    void reserveInventory(@PathVariable UUID productId);

    record InventoryCheckResponse(UUID productId, Integer availableQuantity, boolean inStock) {}
}
