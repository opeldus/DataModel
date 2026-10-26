package de.erdstudio.validation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import de.erdstudio.model.Kernmodell;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Zweistufige Prüfung:
 * 1. Struktur gegen kernmodell.schema.json
 * 2. Referenzielle Integrität (IDs eindeutig, Verweise auflösbar) – das kann JSON Schema nicht.
 */
@Component
public class ModelValidator {

    private final JsonSchema schema;
    private final ObjectMapper mapper;

    public ModelValidator(ObjectMapper mapper) {
        this.mapper = mapper;
        var config = SchemaValidatorsConfig.builder().locale(Locale.GERMAN).build();
        try (InputStream in = new ClassPathResource("schema/kernmodell.schema.json").getInputStream()) {
            this.schema = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(in, config);
        } catch (IOException e) {
            throw new UncheckedIOException("Schema konnte nicht geladen werden", e);
        }
    }

    public List<ValidationIssue> validate(JsonNode raw) {
        List<ValidationIssue> issues = new ArrayList<>(schema.validate(raw).stream()
                .map(m -> ValidationIssue.schema(m.getInstanceLocation().toString(), m.getMessage()))
                .sorted(Comparator.comparing(ValidationIssue::path))
                .toList());
        if (!issues.isEmpty()) {
            return issues; // Referenzprüfung nur auf strukturell gültigem Modell
        }
        issues.addAll(ReferenceChecker.check(mapper.convertValue(raw, Kernmodell.class)));
        return issues;
    }

    public List<ValidationIssue> validate(Kernmodell model) {
        return validate(mapper.valueToTree(model));
    }
}
