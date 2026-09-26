package com.demo.payment.dto;
import java.math.BigDecimal;
import java.util.UUID;
public class PaymentRequest {
    private UUID orderId;
    private Integer customerId;
    private BigDecimal amount;
    private String paymentMethod;
    public UUID getOrderId() { return orderId; }
    public void setOrderId(UUID id) { this.orderId = id; }
    public Integer getCustomerId() { return customerId; }
    public void setCustomerId(Integer id) { this.customerId = id; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal a) { this.amount = a; }
}
