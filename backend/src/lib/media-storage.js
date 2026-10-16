const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const transient = (error) =>
  /10001|internal error|please try again|temporar/iu.test(String(error?.message || error));

async function retry(operation) {
  let lastError;
  for (const delay of [0, 250, 750]) {
    if (delay) await wait(delay);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!transient(error)) throw error;
    }
  }
  throw lastError;
}

export const putMedia = (bucket, key, value, options) =>
  retry(() => bucket.put(key, value, options));

export const deleteMedia = (bucket, key) =>
  key ? retry(() => bucket.delete(key)) : Promise.resolve();

