package de.erdstudio.model;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Kernmodell nach kernmodell.schema.json (formatVersion 1.x).
 * Alle Referenzen laufen über stabile UUIDs, nie über Namen.
 */
public record Kernmodell(
        String formatVersion,
        ModelInfo model,
        List<Domain> domains,
        List<Entity> entities,
        List<Relationship> relationships,
        Map<String, Object> extensions) {

    public List<Domain> domainsOrEmpty() {
        return domains == null ? List.of() : domains;
    }

    public List<Entity> entitiesOrEmpty() {
        return entities == null ? List.of() : entities;
    }

    public List<Relationship> relationshipsOrEmpty() {
        return relationships == null ? List.of() : relationships;
    }

    public Optional<Entity> entity(String id) {
        return entitiesOrEmpty().stream().filter(e -> e.id().equals(id)).findFirst();
    }

    public record ModelInfo(
            String id,
            String name,
            String version,
            String level,
            String targetPlatform,
            String description,
            Governance governance,
            String createdAt,
            String updatedAt,
            Map<String, Object> extensions) {
    }

    public record Governance(
            String status,
            String owner,
            String steward,
            String approvedBy,
            String approvedAt,
            List<String> regulatoryTags) {
    }

    public record Domain(
            String id,
            String name,
            String description,
            String owner,
            Map<String, Object> extensions) {
    }

    public record Entity(
            String id,
            String name,
            String physicalName,
            String kind,
            String schema,
            String database,
            String domainId,
            String dataProduct,
            String description,
            String classification,
            Governance governance,
            List<Attribute> attributes,
            Key primaryKey,
            List<Key> uniqueKeys,
            Map<String, Object> extensions) {

        public String technicalName() {
            return physicalName != null ? physicalName : name;
        }

        public List<Attribute> attributesOrEmpty() {
            return attributes == null ? List.of() : attributes;
        }

        public List<Key> uniqueKeysOrEmpty() {
            return uniqueKeys == null ? List.of() : uniqueKeys;
        }

        public List<String> primaryKeyIds() {
            return primaryKey == null || primaryKey.attributeIds() == null ? List.of() : primaryKey.attributeIds();
        }

        public Optional<Attribute> attribute(String attributeId) {
            return attributesOrEmpty().stream().filter(a -> a.id().equals(attributeId)).findFirst();
        }
    }

    public record Attribute(
            String id,
            String name,
            String physicalName,
            String description,
            DataType dataType,
            Boolean nullable,
            Object defaultValue,
            String classification,
            String businessTerm,
            Integer ordinalPosition,
            Map<String, Object> extensions) {

        public String technicalName() {
            return physicalName != null ? physicalName : name;
        }

        public boolean isNullable() {
            return nullable == null || nullable;
        }
    }

    public record DataType(
            String type,
            Integer length,
            Integer precision,
            Integer scale,
            String nativeType) {
    }

    public record Key(String name, List<String> attributeIds) {
    }

    public record Relationship(
            String id,
            String name,
            String description,
            RelationshipEnd from,
            RelationshipEnd to,
            Boolean identifying,
            Boolean enforced,
            Map<String, Object> extensions) {

        public boolean isIdentifying() {
            return Boolean.TRUE.equals(identifying);
        }
    }

    /** Ende einer Beziehung. 'from' ist die Kind-/FK-Seite, 'to' die Eltern-/PK-Seite. */
    public record RelationshipEnd(
            String entityId,
            List<String> attributeIds,
            String cardinality) {

        public boolean isMany() {
            return "0..n".equals(cardinality) || "1..n".equals(cardinality);
        }
    }
}
