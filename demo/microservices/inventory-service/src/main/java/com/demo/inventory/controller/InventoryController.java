package com.demo.inventory.controller;

import com.demo.inventory.dto.InventoryResponse;
import com.demo.inventory.dto.InventoryUpdateRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/inventory")
public class InventoryController {

    @GetMapping
    public ResponseEntity<List<InventoryResponse>> getAllItems() {
        return ResponseEntity.ok(List.of());
    }

    @GetMapping("/{productId}")
    public ResponseEntity<InventoryResponse> getItem(@PathVariable UUID productId) {
        return ResponseEntity.ok(new InventoryResponse());
    }

    @GetMapping("/{productId}/check")
    public ResponseEntity<InventoryResponse> checkInventory(@PathVariable UUID productId) {
        return ResponseEntity.ok(new InventoryResponse());
    }

    @PostMapping("/{productId}/reserve")
    public ResponseEntity<Void> reserveInventory(@PathVariable UUID productId) {
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{productId}")
    public ResponseEntity<InventoryResponse> updateInventory(
            @PathVariable UUID productId,
            @RequestBody InventoryUpdateRequest request) {
        return ResponseEntity.ok(new InventoryResponse());
    }

    @DeleteMapping("/{productId}")
    public ResponseEntity<Void> removeItem(@PathVariable UUID productId) {
        return ResponseEntity.noContent().build();
    }
}
