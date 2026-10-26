package de.erdstudio.web;

import com.fasterxml.jackson.databind.JsonNode;
import de.erdstudio.export.ModelExporter;
import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Layout;
import de.erdstudio.model.ModelSummary;
import de.erdstudio.service.ModelService;
import de.erdstudio.validation.ValidationIssue;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
public class ModelController {

    private final ModelService service;

    public ModelController(ModelService service) {
        this.service = service;
    }

    @GetMapping("/models")
    public List<ModelSummary> list() {
        return service.list();
    }

    @GetMapping("/models/{id}")
    public Kernmodell get(@PathVariable String id) {
        return service.get(id);
    }

    /** Import eines neuen Modells. Ungültige Modelle → 422 mit Befundliste. */
    @PostMapping("/models")
    @ResponseStatus(HttpStatus.CREATED)
    public Kernmodell create(@RequestBody JsonNode body) {
        return service.create(body);
    }

    @PutMapping("/models/{id}")
    public Kernmodell update(@PathVariable String id, @RequestBody JsonNode body) {
        return service.update(id, body);
    }

    /** Prüft ein Modell, ohne es zu speichern. */
    @PostMapping("/validate")
    public List<ValidationIssue> validate(@RequestBody JsonNode body) {
        return service.validate(body);
    }

    @GetMapping("/models/{id}/validation")
    public List<ValidationIssue> validateStored(@PathVariable String id) {
        return service.validateStored(id);
    }

    @GetMapping("/models/{id}/layout")
    public Layout getLayout(@PathVariable String id) {
        return service.getLayout(id);
    }

    @PutMapping("/models/{id}/layout")
    public Layout saveLayout(@PathVariable String id, @RequestBody Layout layout) {
        return service.saveLayout(id, layout);
    }

    @GetMapping("/formats")
    public List<FormatInfo> formats() {
        return service.exporters().stream()
                .map(e -> new FormatInfo(e.format(), e.label(), e.fileExtension()))
                .toList();
    }

    @GetMapping("/models/{id}/export/{format}")
    public ResponseEntity<String> export(@PathVariable String id, @PathVariable String format) {
        Kernmodell model = service.get(id);
        ModelExporter exporter = service.exporter(format);
        String filename = model.model().name().replaceAll("[^A-Za-z0-9_-]+", "_") + "." + exporter.fileExtension();
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_PLAIN, StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(filename, StandardCharsets.UTF_8).build().toString())
                .body(exporter.export(model));
    }

    public record FormatInfo(String format, String label, String fileExtension) {
    }
}
