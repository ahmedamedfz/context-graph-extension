package com.demo.notification.controller;

import com.demo.notification.dto.NotificationRequest;
import com.demo.notification.dto.NotificationResponse;
import com.demo.notification.entity.Notification;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.transaction.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    @PersistenceContext
    private EntityManager entityManager;

    @PostMapping("/send")
    @Transactional
    public ResponseEntity<NotificationResponse> sendNotification(@RequestBody NotificationRequest request) {
        Notification notification = new Notification();
        notification.setOrderId(request.orderId());
        notification.setCustomerId(request.customerId());
        notification.setType(request.type());
        notification.setMessage(request.message());
        notification.setStatus("SENT");
        notification.setSentAt(LocalDateTime.now());

        entityManager.persist(notification);

        return ResponseEntity.ok(toResponse(notification));
    }

    @GetMapping("/{id}")
    public ResponseEntity<NotificationResponse> getNotification(@PathVariable UUID id) {
        Notification notification = entityManager.find(Notification.class, id);
        if (notification == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(toResponse(notification));
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<List<NotificationResponse>> getNotificationsByOrder(@PathVariable UUID orderId) {
        List<Notification> notifications = entityManager
            .createQuery("SELECT n FROM Notification n WHERE n.orderId = :orderId", Notification.class)
            .setParameter("orderId", orderId)
            .getResultList();
        return ResponseEntity.ok(notifications.stream().map(this::toResponse).toList());
    }

    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<NotificationResponse>> getNotificationsByCustomer(@PathVariable Integer customerId) {
        List<Notification> notifications = entityManager
            .createQuery("SELECT n FROM Notification n WHERE n.customerId = :customerId", Notification.class)
            .setParameter("customerId", customerId)
            .getResultList();
        return ResponseEntity.ok(notifications.stream().map(this::toResponse).toList());
    }

    private NotificationResponse toResponse(Notification n) {
        return new NotificationResponse(
            n.getId(), n.getOrderId(), n.getCustomerId(),
            n.getType(), n.getStatus(), n.getMessage(), n.getSentAt()
        );
    }
}
