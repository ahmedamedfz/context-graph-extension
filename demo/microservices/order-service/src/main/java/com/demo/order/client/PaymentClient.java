package com.demo.order.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.math.BigDecimal;
import java.util.UUID;

@FeignClient(name = "payment-service", url = "${payment-service.url}")
public interface PaymentClient {

    @PostMapping("/payments/process")
    PaymentResponse processPayment(@RequestBody PaymentRequest request);

    record PaymentRequest(UUID orderId, Integer customerId, BigDecimal amount) {}
    record PaymentResponse(UUID paymentId, String status, String transactionId) {}
}
