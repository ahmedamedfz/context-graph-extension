package com.demo.order.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.UUID;

@FeignClient(name = "notification-service", url = "${notification-service.url}")
public interface NotificationClient {

    @PostMapping("/notifications/send")
    NotificationResponse sendNotification(@RequestBody NotificationRequest request);

    record NotificationRequest(UUID orderId, Integer customerId, String type, String message) {}
    record NotificationResponse(UUID id, UUID orderId, Integer customerId, String type, String status, String message) {}
}
