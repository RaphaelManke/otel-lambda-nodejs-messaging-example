export const load = async (url, context, defaultLoad) => {
    console.log('import: ' + url);
    return await defaultLoad(url, context);
};