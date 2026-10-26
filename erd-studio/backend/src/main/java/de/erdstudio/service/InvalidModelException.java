package de.erdstudio.service;

import de.erdstudio.validation.ValidationIssue;

import java.util.List;

public class InvalidModelException extends RuntimeException {

    private final List<ValidationIssue> issues;

    public InvalidModelException(List<ValidationIssue> issues) {
        super("Das Modell ist ungültig (" + issues.size() + " Befunde).");
        this.issues = issues;
    }

    public List<ValidationIssue> issues() {
        return issues;
    }
}
