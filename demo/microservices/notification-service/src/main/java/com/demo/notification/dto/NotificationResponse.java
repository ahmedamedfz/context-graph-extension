package com.demo.notification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record NotificationResponse(
    UUID id,
    UUID orderId,
    Integer customerId,
    String type,
    String status,
    String message,
    LocalDateTime sentAt
) {}
