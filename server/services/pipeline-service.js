import jobQueue from "./jobQueue.js";

export async function enqueuePipeline({ pipelineType, payload, requestedBy, metadata = {} }) {
  const pipelineJob = await jobQueue.enqueue({
    type: "pipeline",
    payload: { pipelineType, ...payload },
    requestedBy,
    metadata: { ...metadata, pipelineType },
    priority: 1,
    pipelineId: `pipeline_${Date.now()}`,
    stepType: "pipeline-root",
  });

  let childJobs = [];
  if (pipelineType === "image-to-video") {
    const imageJob = await jobQueue.enqueue({
      type: "image",
      payload: payload.imagePayload || {},
      requestedBy,
      parentJobId: pipelineJob.id,
      pipelineId: pipelineJob.pipelineId,
      stepType: "generate-image",
      metadata,
    });
    const videoJob = await jobQueue.enqueue({
      type: "video",
      payload: payload.videoPayload || {},
      requestedBy,
      parentJobId: pipelineJob.id,
      pipelineId: pipelineJob.pipelineId,
      stepType: "generate-video",
      dependsOn: [imageJob.id],
      metadata,
    });
    childJobs = [imageJob, videoJob];
  } else if (pipelineType === "music-to-editor") {
    const musicJob = await jobQueue.enqueue({
      type: "music",
      payload: payload.musicPayload || {},
      requestedBy,
      parentJobId: pipelineJob.id,
      pipelineId: pipelineJob.pipelineId,
      stepType: "generate-audio",
      metadata,
    });
    childJobs = [musicJob];
  } else if (pipelineType === "remix-to-video") {
    const remixJob = await jobQueue.enqueue({
      type: "music",
      payload: payload.remixPayload || {},
      requestedBy,
      parentJobId: pipelineJob.id,
      pipelineId: pipelineJob.pipelineId,
      stepType: "remix-audio",
      metadata,
    });
    const videoJob = await jobQueue.enqueue({
      type: "video",
      payload: payload.videoPayload || {},
      requestedBy,
      parentJobId: pipelineJob.id,
      pipelineId: pipelineJob.pipelineId,
      stepType: "compose-video",
      dependsOn: [remixJob.id],
      metadata,
    });
    childJobs = [remixJob, videoJob];
  }

  return { pipelineJob, childJobs };
}
