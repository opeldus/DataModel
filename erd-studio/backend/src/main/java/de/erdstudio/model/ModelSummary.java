package de.erdstudio.model;

public record ModelSummary(
        String id,
        String name,
        String version,
        String status,
        int entityCount,
        int relationshipCount) {

    public static ModelSummary of(Kernmodell m) {
        var info = m.model();
        String status = info.governance() == null ? null : info.governance().status();
        return new ModelSummary(info.id(), info.name(), info.version(), status,
                m.entitiesOrEmpty().size(), m.relationshipsOrEmpty().size());
    }
}
