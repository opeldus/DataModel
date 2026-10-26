package de.erdstudio.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Layout;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Dateibasierte Ablage: ein Modell = eine JSON-Datei ({id}.json), Layout separat ({id}.layout.json).
 * Das Verzeichnis kann ein Git-Repository sein, damit Änderungen per Pull Request reviewt werden.
 */
@Repository
public class ModelRepository {

    private static final Logger log = LoggerFactory.getLogger(ModelRepository.class);
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F-]{36}$");

    private final Path dir;
    private final ObjectMapper mapper;

    public ModelRepository(@Value("${erd.model-dir:./models}") String modelDir, ObjectMapper mapper) {
        this.dir = Path.of(modelDir).toAbsolutePath().normalize();
        this.mapper = mapper.copy().enable(SerializationFeature.INDENT_OUTPUT);
        init();
    }

    private void init() {
        try {
            Files.createDirectories(dir);
            boolean empty;
            try (Stream<Path> files = Files.list(dir)) {
                empty = files.noneMatch(this::isModelFile);
            }
            if (empty) {
                for (Resource r : new PathMatchingResourcePatternResolver().getResources("classpath:samples/*.json")) {
                    try (InputStream in = r.getInputStream()) {
                        Kernmodell m = mapper.readValue(in, Kernmodell.class);
                        save(m);
                        log.info("Beispielmodell '{}' angelegt", m.model().name());
                    }
                }
            }
            log.info("Modellverzeichnis: {}", dir);
        } catch (IOException e) {
            throw new UncheckedIOException("Modellverzeichnis nicht nutzbar: " + dir, e);
        }
    }

    public List<Kernmodell> findAll() {
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(this::isModelFile)
                    .map(this::read)
                    .flatMap(Optional::stream)
                    .sorted(Comparator.comparing(m -> m.model().name()))
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public Optional<Kernmodell> findById(String id) {
        return read(modelPath(id));
    }

    public void save(Kernmodell model) {
        write(modelPath(model.model().id()), model);
    }

    public Optional<Layout> findLayout(String id) {
        Path p = layoutPath(id);
        if (!Files.exists(p)) {
            return Optional.empty();
        }
        try {
            return Optional.of(mapper.readValue(p.toFile(), Layout.class));
        } catch (IOException e) {
            log.warn("Layout {} nicht lesbar: {}", p, e.getMessage());
            return Optional.empty();
        }
    }

    public void saveLayout(String id, Layout layout) {
        write(layoutPath(id), layout);
    }

    public Layout emptyLayout() {
        return new Layout(Map.of());
    }

    private boolean isModelFile(Path p) {
        String n = p.getFileName().toString();
        return n.endsWith(".json") && !n.endsWith(".layout.json");
    }

    private Optional<Kernmodell> read(Path p) {
        if (!Files.exists(p)) {
            return Optional.empty();
        }
        try {
            return Optional.of(mapper.readValue(p.toFile(), Kernmodell.class));
        } catch (IOException e) {
            log.warn("Modell {} nicht lesbar: {}", p, e.getMessage());
            return Optional.empty();
        }
    }

    /** Atomar schreiben: erst Temp-Datei, dann umbenennen. */
    private void write(Path target, Object value) {
        try {
            Path tmp = Files.createTempFile(dir, ".tmp-", ".json");
            mapper.writeValue(tmp.toFile(), value);
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException("Speichern fehlgeschlagen: " + target, e);
        }
    }

    private Path modelPath(String id) {
        return dir.resolve(safe(id) + ".json");
    }

    private Path layoutPath(String id) {
        return dir.resolve(safe(id) + ".layout.json");
    }

    /** Schutz vor Path Traversal: nur UUIDs als Dateinamen. */
    private static String safe(String id) {
        if (id == null || !UUID.matcher(id).matches()) {
            throw new IllegalArgumentException("Ungültige Modell-ID: " + id);
        }
        return id.toLowerCase();
    }
}
