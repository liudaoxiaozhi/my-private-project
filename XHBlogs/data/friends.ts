// data/friends.ts —— 友链。内容在 friends.json 里，后台「友链」改的就是那个文件
import data from './friends.json';

export interface Friend { id: string; name: string; url: string; description: string; avatar: string; themeColor: string; }

export const friendsData: Friend[] = data;
