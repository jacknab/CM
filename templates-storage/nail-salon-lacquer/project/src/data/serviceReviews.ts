export interface ServiceReview {
  serviceId: string;
  name: string;
  rating: number;
  quote: string;
  image: string;
  date: string;
}

export const serviceReviews: ServiceReview[] = [
  {
    serviceId: 'gel-manicure',
    name: 'Amara B.',
    rating: 5,
    quote: 'Three weeks in and still not a single chip. Obsessed!',
    image:
      'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=300',
    date: '2 days ago',
  },
  {
    serviceId: 'spa-pedicure',
    name: 'Jordan M.',
    rating: 5,
    quote: 'The hot stone massage was pure heaven. Walking out on clouds.',
    image:
      'https://images.pexels.com/photos/4968391/pexels-photo-4968391.jpeg?auto=compress&cs=tinysrgb&w=300',
    date: '5 days ago',
  },
  {
    serviceId: 'gel-x-extension',
    name: 'Sophie T.',
    rating: 5,
    quote: 'Lightest extensions I have ever had. Look so natural!',
    image:
      'https://images.pexels.com/photos/8824063/pexels-photo-8824063.jpeg?auto=compress&cs=tinysrgb&w=300',
    date: '1 week ago',
  },
];
