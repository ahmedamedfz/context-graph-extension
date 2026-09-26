package com.demo.order.service;

import com.demo.order.dto.OrderRequest;
import com.demo.order.dto.OrderResponse;

import java.util.List;
import java.util.UUID;

public interface OrderService {
    List<OrderResponse> findAll();
    OrderResponse findById(UUID id);
    OrderResponse createOrder(OrderRequest request);
    OrderResponse updateOrder(UUID id, OrderRequest request);
    void deleteOrder(UUID id);
    List<OrderResponse> findByCustomerId(Integer customerId);
}
