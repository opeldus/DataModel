package de.erdstudio.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.erdstudio.export.ModelExporter;
import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Layout;
import de.erdstudio.model.ModelSummary;
import de.erdstudio.repository.ModelRepository;
import de.erdstudio.validation.ModelValidator;
import de.erdstudio.validation.ValidationIssue;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ModelService {

    private final ModelRepository repository;
    private final ModelValidator validator;
    private final ObjectMapper mapper;
    private final Map<String, ModelExporter> exporters;

    public ModelService(ModelRepository repository, ModelValidator validator, ObjectMapper mapper,
                        List<ModelExporter> exporters) {
        this.repository = repository;
        this.validator = validator;
        this.mapper = mapper;
        this.exporters = exporters.stream().collect(Collectors.toMap(ModelExporter::format, Function.identity()));
    }

    public List<ModelSummary> list() {
        return repository.findAll().stream().map(ModelSummary::of).toList();
    }

    public Kernmodell get(String id) {
        return repository.findById(id).orElseThrow(() -> new ModelNotFoundException(id));
    }

    public List<ValidationIssue> validate(JsonNode raw) {
        return validator.validate(raw);
    }

    public List<ValidationIssue> validateStored(String id) {
        return validator.validate(get(id));
    }

    /** Neues Modell anlegen (Import). Bestehende IDs werden nicht überschrieben. */
    public Kernmodell create(JsonNode raw) {
        Kernmodell model = parseValid(raw);
        if (repository.findById(model.model().id()).isPresent()) {
            throw new ModelConflictException(model.model().id());
        }
        repository.save(model);
        return model;
    }

    /** Bestehendes Modell ersetzen. */
    public Kernmodell update(String id, JsonNode raw) {
        get(id);
        Kernmodell model = parseValid(raw);
        if (!id.equalsIgnoreCase(model.model().id())) {
            throw new IllegalArgumentException("model.id im Inhalt passt nicht zur ID in der URL.");
        }
        repository.save(model);
        return model;
    }

    public Layout getLayout(String id) {
        get(id);
        return repository.findLayout(id).orElse(repository.emptyLayout());
    }

    /** Speichert nur Positionen zu Entitäten, die im Modell existieren. */
    public Layout saveLayout(String id, Layout layout) {
        Kernmodell model = get(id);
        Map<String, Layout.Position> cleaned = new HashMap<>();
        if (layout.positions() != null) {
            layout.positions().forEach((entityId, pos) -> {
                if (model.entity(entityId).isPresent() && pos != null) {
                    cleaned.put(entityId, pos);
                }
            });
        }
        Layout result = new Layout(cleaned);
        repository.saveLayout(id, result);
        return result;
    }

    public List<ModelExporter> exporters() {
        return exporters.values().stream().sorted((a, b) -> a.label().compareTo(b.label())).toList();
    }

    public ModelExporter exporter(String format) {
        ModelExporter e = exporters.get(format);
        if (e == null) {
            throw new IllegalArgumentException("Unbekanntes Format '" + format + "'. Verfügbar: " + exporters.keySet());
        }
        return e;
    }

    private Kernmodell parseValid(JsonNode raw) {
        List<ValidationIssue> issues = validator.validate(raw);
        if (!issues.isEmpty()) {
            throw new InvalidModelException(issues);
        }
        return mapper.convertValue(raw, Kernmodell.class);
    }
}
