interface AggregationChunk {
  period: string;
  total: number;
  average: number;
  min: number;
  max: number;
  count: number;
}

interface WorkerPayload {
  type: "aggregate" | "filter" | "transform";
  data: number[];
  config?: {
    chunkSize?: number;
    period?: string;
    threshold?: number;
  };
}

function aggregateChunks(data: number[], chunkSize: number): AggregationChunk[] {
  const chunks: AggregationChunk[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const sum = chunk.reduce((a, b) => a + b, 0);
    chunks.push({
      period: `chunk-${Math.floor(i / chunkSize)}`,
      total: sum,
      average: chunk.length > 0 ? sum / chunk.length : 0,
      min: Math.min(...chunk),
      max: Math.max(...chunk),
      count: chunk.length,
    });
  }
  return chunks;
}

function filterOutliers(data: number[], threshold: number): number[] {
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const stdDev = Math.sqrt(
    data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length
  );
  return data.filter(
    (value) => Math.abs(value - mean) <= threshold * stdDev
  );
}

self.onmessage = (event: MessageEvent<WorkerPayload>) => {
  const { type, data, config } = event.data;

  switch (type) {
    case "aggregate": {
      const chunkSize = config?.chunkSize || 100;
      const result = aggregateChunks(data, chunkSize);
      self.postMessage({ type: "aggregate_result", data: result });
      break;
    }
    case "filter": {
      const threshold = config?.threshold || 3;
      const result = filterOutliers(data, threshold);
      self.postMessage({ type: "filter_result", data: result });
      break;
    }
    case "transform": {
      const transformed = data.map((value) => ({
        original: value,
        scaled: value / 100,
        normalized: (value - Math.min(...data)) /
          (Math.max(...data) - Math.min(...data) || 1),
      }));
      self.postMessage({ type: "transform_result", data: transformed });
      break;
    }
    default:
      self.postMessage({ type: "error", data: `Unknown type: ${type}` });
  }
};
