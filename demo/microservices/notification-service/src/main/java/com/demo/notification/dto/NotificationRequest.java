package com.demo.notification.dto;

import java.util.UUID;

public record NotificationRequest(
    UUID orderId,
    Integer customerId,
    String type,
    String message
) {}
