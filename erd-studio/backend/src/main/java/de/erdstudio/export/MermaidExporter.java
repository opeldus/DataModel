package de.erdstudio.export;

import de.erdstudio.model.Kernmodell;
import de.erdstudio.model.Kernmodell.DataType;
import de.erdstudio.model.Kernmodell.Entity;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static de.erdstudio.export.ExportSupport.orderedAttributes;

/** Kernmodell → Mermaid erDiagram (GitLab, GitHub, Confluence-Plugin). */
@Component
public class MermaidExporter implements ModelExporter {

    private static final Map<String, String> LEFT = Map.of("1", "||", "0..1", "|o", "0..n", "}o", "1..n", "}|");
    private static final Map<String, String> RIGHT = Map.of("1", "||", "0..1", "o|", "0..n", "o{", "1..n", "|{");

    @Override
    public String format() {
        return "mermaid";
    }

    @Override
    public String label() {
        return "Mermaid";
    }

    @Override
    public String fileExtension() {
        return "mmd";
    }

    @Override
    public String export(Kernmodell m) {
        Set<String> fkIds = m.relationshipsOrEmpty().stream()
                .flatMap(r -> r.from().attributeIds().stream()).collect(Collectors.toSet());
        StringBuilder out = new StringBuilder("erDiagram\n");

        for (Entity e : m.entitiesOrEmpty()) {
            out.append("    ").append(ident(e.technicalName())).append(" {\n");
            for (var a : orderedAttributes(e)) {
                List<String> keys = new ArrayList<>();
                if (e.primaryKeyIds().contains(a.id())) {
                    keys.add("PK");
                }
                if (fkIds.contains(a.id())) {
                    keys.add("FK");
                }
                out.append("        ").append(typeLabel(a.dataType())).append(' ').append(ident(a.technicalName()))
                        .append(keys.isEmpty() ? "" : " " + String.join(",", keys))
                        .append(a.name() != null ? " \"" + a.name().replace("\"", "'") + "\"" : "")
                        .append('\n');
            }
            out.append("    }\n");
        }

        for (var r : m.relationshipsOrEmpty()) {
            Entity parent = m.entity(r.to().entityId()).orElseThrow();
            Entity child = m.entity(r.from().entityId()).orElseThrow();
            out.append("    ").append(ident(parent.technicalName())).append(' ')
                    .append(LEFT.get(r.to().cardinality())).append(r.isIdentifying() ? "--" : "..")
                    .append(RIGHT.get(r.from().cardinality())).append(' ')
                    .append(ident(child.technicalName())).append(" : \"")
                    .append(r.name() == null ? "" : r.name()).append("\"\n");
        }
        return out.toString();
    }

    private static String ident(String s) {
        return s.replaceAll("[^A-Za-z0-9_]", "_");
    }

    private static String typeLabel(DataType dt) {
        if ("decimal".equals(dt.type())) {
            return "decimal_" + dt.precision() + "_" + (dt.scale() == null ? 0 : dt.scale());
        }
        return dt.length() != null ? dt.type() + "_" + dt.length() : dt.type();
    }
}
