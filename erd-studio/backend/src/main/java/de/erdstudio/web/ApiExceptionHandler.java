package de.erdstudio.web;

import de.erdstudio.service.InvalidModelException;
import de.erdstudio.service.ModelConflictException;
import de.erdstudio.service.ModelNotFoundException;
import de.erdstudio.validation.ValidationIssue;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

@RestControllerAdvice
public class ApiExceptionHandler {

    public record ApiError(String message, List<ValidationIssue> issues) {
    }

    @ExceptionHandler(ModelNotFoundException.class)
    ResponseEntity<ApiError> notFound(ModelNotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e.getMessage(), List.of());
    }

    @ExceptionHandler(ModelConflictException.class)
    ResponseEntity<ApiError> conflict(ModelConflictException e) {
        return error(HttpStatus.CONFLICT, e.getMessage(), List.of());
    }

    @ExceptionHandler(InvalidModelException.class)
    ResponseEntity<ApiError> invalid(InvalidModelException e) {
        return error(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage(), e.issues());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> badRequest(IllegalArgumentException e) {
        return error(HttpStatus.BAD_REQUEST, e.getMessage(), List.of());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException e) {
        return error(HttpStatus.BAD_REQUEST, "Die Datei ist kein gültiges JSON.", List.of());
    }

    private static ResponseEntity<ApiError> error(HttpStatus status, String message, List<ValidationIssue> issues) {
        return ResponseEntity.status(status).body(new ApiError(message, issues));
    }
}
