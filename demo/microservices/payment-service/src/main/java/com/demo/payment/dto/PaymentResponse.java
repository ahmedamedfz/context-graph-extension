package com.demo.payment.dto;
import java.math.BigDecimal;
import java.util.UUID;
public class PaymentResponse {
    private UUID paymentId;
    private String status;
    private String transactionId;
    private BigDecimal amount;
    public UUID getPaymentId() { return paymentId; }
    public void setPaymentId(UUID id) { this.paymentId = id; }
    public String getStatus() { return status; }
    public void setStatus(String s) { this.status = s; }
    public String getTransactionId() { return transactionId; }
    public void setTransactionId(String t) { this.transactionId = t; }
}
